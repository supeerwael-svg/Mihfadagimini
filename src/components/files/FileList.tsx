import React, { useEffect, useState } from 'react';
import { services } from '@/src/services';
import type { FileRecord, SectionNode, SubjectRecord, UserRecord } from '@/src/types/models';
import type { ServiceContext } from '@/src/types/services';
import { VirtualizedFileBrowser } from '@/src/components/library/VirtualizedFileBrowser';
import { FileDetailsModal } from './FileDetailsModal';

interface FileListProps {
  ctx?: ServiceContext;
  user?: UserRecord;
  files: FileRecord[];
  allSections?: SectionNode[];
  subjects?: SubjectRecord[];
  canWrite: boolean;
  showSolutionSupport?: boolean;
  toolbarActionsSlot?: React.ReactNode;
  onOpenFile: (file: FileRecord, initialPage?: number) => void;
  onOpenDetails?: (file: FileRecord) => void;
  onChanged: () => void;
}

export const FileList: React.FC<FileListProps> = ({
  ctx: propCtx,
  user: propUser,
  files,
  allSections = [],
  subjects: propSubjects,
  canWrite,
  showSolutionSupport = false,
  toolbarActionsSlot,
  onOpenFile,
  onOpenDetails,
  onChanged,
}) => {
  const [fallbackUser, setFallbackUser] = useState<UserRecord | null>(propUser ?? null);
  const [fallbackSubjects, setFallbackSubjects] = useState<SubjectRecord[]>(propSubjects ?? []);
  const [localDetailsFile, setLocalDetailsFile] = useState<FileRecord | null>(null);

  const sampleFile = files[0];
  const resolvedCtx: ServiceContext = propCtx ?? {
    ownerId: sampleFile?.ownerId || fallbackUser?.id || '',
    schoolId: sampleFile?.schoolId || 'school_default',
    academicYearId: sampleFile?.academicYearId || 'year_default',
  };

  useEffect(() => {
    if (propUser) {
      setFallbackUser(propUser);
    } else {
      services.auth.getCurrentUser().then((u) => {
        if (u) setFallbackUser(u);
      });
    }
  }, [propUser]);

  useEffect(() => {
    if (propSubjects) {
      setFallbackSubjects(propSubjects);
    } else if (resolvedCtx.academicYearId && (propUser?.id || fallbackUser?.id)) {
      services.subjects
        .listForTeacher(
          resolvedCtx.academicYearId,
          propUser?.id || fallbackUser?.id || '',
          false
        )
        .then(setFallbackSubjects);
    }
  }, [propSubjects, resolvedCtx.academicYearId, propUser?.id, fallbackUser?.id]);

  const activeUser: UserRecord = propUser ??
    fallbackUser ?? {
      id: resolvedCtx.ownerId || 'teacher',
      username: 'teacher',
      displayName: '',
      subjectSpecialty: '',
      passwordHash: '',
      passwordSalt: '',
      role: canWrite ? 'primary_admin' : 'teacher_read',
      assignedClasses: [],
      sectionPermissions: {},
      isOnlineSimulated: false,
      lastSeenAt: '',
      createdAt: '',
      updatedAt: '',
      deletedAt: null,
      syncStatus: 'local',
      ownerId: resolvedCtx.ownerId || 'teacher',
      schoolId: resolvedCtx.schoolId,
      academicYearId: resolvedCtx.academicYearId,
    };

  const activeSubjects = propSubjects ?? fallbackSubjects;

  const handleOpenDetails = (file: FileRecord) => {
    if (onOpenDetails) {
      onOpenDetails(file);
    } else {
      setLocalDetailsFile(file);
    }
  };

  return (
    <>
      <VirtualizedFileBrowser
        ctx={resolvedCtx}
        user={activeUser}
        files={files}
        sections={allSections}
        subjects={activeSubjects}
        canWrite={canWrite}
        showSolutionSupport={showSolutionSupport}
        toolbarActionsSlot={toolbarActionsSlot}
        onOpenFile={onOpenFile}
        onOpenDetails={handleOpenDetails}
        onChanged={onChanged}
      />

      {!onOpenDetails && (
        <FileDetailsModal
          file={localDetailsFile}
          ctx={resolvedCtx}
          sections={allSections}
          subjects={activeSubjects}
          canWrite={canWrite}
          onClose={() => setLocalDetailsFile(null)}
          onOpenViewer={(f, pg) => {
            setLocalDetailsFile(null);
            onOpenFile(f, pg);
          }}
          onUpdated={onChanged}
        />
      )}
    </>
  );
};
