using BibleNote.Analytics.Services.DocumentProvider.Contracts;

namespace BibleNote.Analytics.Providers.FileSystem.Navigation
{
    public class FileDocumentId : IDocumentId
    {
        public int DocumentId { get; private set; }

        public string FilePath { get; private set; }

        public bool IsReadonly { get; private set; }

        public bool Changed { get; set; }

        public FileDocumentId(int documentId, string filePath, bool isReadonly)
        {
            DocumentId = documentId;
            FilePath = filePath;
            IsReadonly = isReadonly;
        }
    }
}
