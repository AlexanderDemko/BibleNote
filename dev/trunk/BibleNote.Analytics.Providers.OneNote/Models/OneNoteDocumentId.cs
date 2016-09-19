using BibleNote.Analytics.Contracts.Providers;

namespace BibleNote.Analytics.Providers.OneNote.Models
{
    public class OneNoteDocumentId : IDocumentId
    {
        public string DocumentId { get; private set; }

        public bool IsReadonly { get { return false; } }

        public bool Changed { get; set; }

        public OneNoteDocumentId(string documentId)
        {
            DocumentId = documentId;            
        }
    }
}
