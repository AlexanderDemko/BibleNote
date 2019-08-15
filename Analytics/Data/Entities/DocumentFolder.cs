namespace BibleNote.Analytics.Data.Entities
{
    public class DocumentFolder
    {
        public int Id { get; set; }

        public string Name { get; set; }

        public string Path { get; set; }

        public string NavigationProviderName { get; set; }

        public int? ParentFolderId { get; set; }

        public DocumentFolder ParentFolder { get; set; }
    }
}
