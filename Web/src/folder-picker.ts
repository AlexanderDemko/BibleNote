export type FolderDialogResult = {
  canceled: boolean;
  filePaths: string[];
};

export type FolderSelectionResponse = {
  available: true;
  canceled: boolean;
  folderPath?: string;
};

export function resolveFolderSelection(
  result: FolderDialogResult,
  initialFolderPath: string
): FolderSelectionResponse {
  if (result.canceled) return { available:true, canceled:true };
  const selectedPath = result.filePaths.find(value => typeof value === 'string' && Boolean(value.trim()))?.trim();
  return {
    available:true,
    canceled:false,
    folderPath:selectedPath || initialFolderPath
  };
}
