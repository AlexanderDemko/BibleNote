using BibleNote.Analytics.Contracts.Providers;

namespace BibleNote.Analytics.Providers.FileSystem.Navigation
{
    public class FileDocumentId: IDocumentId
    {
        public string FilePath { get; private set; }

        public bool IsReadonly { get; private set; }

        public bool Changed { get; set; }

        public FileDocumentId(string filePath, bool isReadonly)
        {
            FilePath = filePath;
            IsReadonly = isReadonly;
        }
    }
}
