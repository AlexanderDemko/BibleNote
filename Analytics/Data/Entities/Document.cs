using System.Collections.Generic;

namespace BibleNote.Analytics.Data.Entities
{    
    public class Document
    {     
        public int DocumentId { get; set; }
     
        public string Name { get; set; }
        
        public string Path { get; set; }

        public decimal Weight { get; set; }

        public int DocumentFolderId { get; set; }

        public DocumentFolder Folder { get; set; }

        public virtual IList<DocumentParagraph> Paragraphs { get; set; }
    }
}
