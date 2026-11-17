import type {
  LocalizedText,
  MiddleSchoolLevel,
  SectionFeatureType,
  SectionNode,
  SectionNodeKind,
} from '@/src/types/models';
import type { IDataAdapter, ServiceContext } from '@/src/types/services';
import { generateId } from './crypto';

export class SectionsService {
  constructor(private adapter: IDataAdapter) {}

  async getAllForYear(academicYearId: string): Promise<SectionNode[]> {
    const list = await this.adapter.queryByYear('sections', academicYearId);
    return list.sort((a, b) => a.order - b.order);
  }

  async getMainSections(
    academicYearId: string,
    includeHidden = false
  ): Promise<SectionNode[]> {
    const all = await this.getAllForYear(academicYearId);
    return all
      .filter((s) => s.parentId === null && (includeHidden || !s.isHidden))
      .sort((a, b) => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        return a.order - b.order;
      });
  }

  async getChildren(
    academicYearId: string,
    parentId: string,
    includeHidden = false
  ): Promise<SectionNode[]> {
    const all = await this.getAllForYear(academicYearId);
    return all
      .filter((s) => s.parentId === parentId && (includeHidden || !s.isHidden))
      .sort((a, b) => a.order - b.order);
  }

  async getById(sectionId: string): Promise<SectionNode | undefined> {
    return this.adapter.getById('sections', sectionId);
  }

  async getBreadcrumb(academicYearId: string, sectionId: string): Promise<SectionNode[]> {
    const all = await this.getAllForYear(academicYearId);
    const map = new Map(all.map((s) => [s.id, s]));
    const chain: SectionNode[] = [];
    let current = map.get(sectionId);
    while (current) {
      chain.unshift(current);
      current = current.parentId ? map.get(current.parentId) : undefined;
    }
    return chain;
  }

  async getDescendantIds(academicYearId: string, rootId: string): Promise<string[]> {
    const all = await this.getAllForYear(academicYearId);
    const result: string[] = [rootId];
    const queue: string[] = [rootId];
    while (queue.length > 0) {
      const curr = queue.shift()!;
      for (const node of all) {
        if (node.parentId === curr) {
          result.push(node.id);
          queue.push(node.id);
        }
      }
    }
    return result;
  }

  async addNode(
    ctx: ServiceContext,
    params: {
      parentId: string | null;
      kind: SectionNodeKind;
      featureType?: SectionFeatureType;
      names: LocalizedText;
      icon: string;
      accentColor: string;
      levelCode?: MiddleSchoolLevel;
      termNumber?: 1 | 2 | 3;
    }
  ): Promise<SectionNode> {
    const siblings = await this.getAllForYear(ctx.academicYearId);
    const sameParent = siblings.filter((s) => s.parentId === params.parentId);
    const maxOrder = sameParent.reduce((m, s) => Math.max(m, s.order), 0);
    const now = new Date().toISOString();
    const node: SectionNode = {
      id: `${ctx.academicYearId}__custom_${generateId().slice(0, 8)}`,
      parentId: params.parentId,
      kind: params.kind,
      featureType: params.featureType ?? 'standard',
      names: { ...params.names },
      defaultNames: { ...params.names },
      icon: params.icon,
      accentColor: params.accentColor,
      order: maxOrder + 1,
      isHidden: false,
      isPinned: false,
      isDefault: false,
      isCustomized: true,
      levelCode: params.levelCode,
      termNumber: params.termNumber,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      syncStatus: 'local',
      ownerId: ctx.ownerId,
      schoolId: ctx.schoolId,
      academicYearId: ctx.academicYearId,
    };
    await this.adapter.put('sections', node);
    return node;
  }

  async renameNode(sectionId: string, names: LocalizedText): Promise<SectionNode | null> {
    const node = await this.adapter.getById('sections', sectionId);
    if (!node) return null;
    const updated: SectionNode = {
      ...node,
      names: { ...names },
      isCustomized: true,
      updatedAt: new Date().toISOString(),
    };
    await this.adapter.put('sections', updated);
    return updated;
  }

  async restoreDefaultNames(sectionId: string): Promise<SectionNode | null> {
    const node = await this.adapter.getById('sections', sectionId);
    if (!node) return null;
    const updated: SectionNode = {
      ...node,
      names: { ...node.defaultNames },
      updatedAt: new Date().toISOString(),
    };
    await this.adapter.put('sections', updated);
    return updated;
  }

  async toggleHide(sectionId: string): Promise<void> {
    const node = await this.adapter.getById('sections', sectionId);
    if (!node) return;
    await this.adapter.put('sections', {
      ...node,
      isHidden: !node.isHidden,
      isCustomized: true,
      updatedAt: new Date().toISOString(),
    });
  }

  async togglePin(sectionId: string): Promise<void> {
    const node = await this.adapter.getById('sections', sectionId);
    if (!node) return;
    await this.adapter.put('sections', {
      ...node,
      isPinned: !node.isPinned,
      isCustomized: true,
      updatedAt: new Date().toISOString(),
    });
  }

  async reorderNodes(orderedIds: string[]): Promise<void> {
    const now = new Date().toISOString();
    const updates: SectionNode[] = [];
    for (let i = 0; i < orderedIds.length; i++) {
      const node = await this.adapter.getById('sections', orderedIds[i]);
      if (node) {
        updates.push({
          ...node,
          order: i + 1,
          isCustomized: true,
          updatedAt: now,
        });
      }
    }
    await this.adapter.bulkPut('sections', updates);
  }

  async updateAppearance(
    sectionId: string,
    patch: { icon?: string; accentColor?: string }
  ): Promise<void> {
    const node = await this.adapter.getById('sections', sectionId);
    if (!node) return;
    await this.adapter.put('sections', {
      ...node,
      ...patch,
      isCustomized: true,
      updatedAt: new Date().toISOString(),
    });
  }

  /**
   * Deletes a section safely: either moves all descendant files to targetSectionId
   * or soft-deletes them alongside the section subtree.
   */
  async deleteNodeSafely(
    academicYearId: string,
    sectionId: string,
    mode: 'move_files' | 'delete_files',
    targetSectionId?: string
  ): Promise<void> {
    const descendantIds = await this.getDescendantIds(academicYearId, sectionId);
    const idSet = new Set(descendantIds);
    const files = await this.adapter.queryByYear('files', academicYearId);
    const now = new Date().toISOString();

    for (const file of files) {
      if (!idSet.has(file.sectionId)) continue;
      if (mode === 'move_files' && targetSectionId) {
        await this.adapter.put('files', {
          ...file,
          sectionId: targetSectionId,
          updatedAt: now,
        });
      } else {
        await this.adapter.softDelete('files', file.id);
      }
    }

    for (const id of descendantIds) {
      await this.adapter.softDelete('sections', id);
    }
  }
}
