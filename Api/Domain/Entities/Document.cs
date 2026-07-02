using System;
using System.Collections.Generic;

namespace BibleNote.Domain.Entities
{    
    public class Document
    {     
        public int Id { get; set; }
     
        public string Name { get; set; }
        
        /// <summary>
        /// Document Identificator. For FileNavigationProvider is filePath, for OneNoteNavigationProvider is pageId.
        /// </summary>
        public string Path { get; set; }

        public decimal Weight { get; set; }

        public DateTime? LastModifiedTime { get; set; }

        public int DocumentFolderId { get; set; }
        public DocumentFolder Folder { get; set; }

        public int? LatestAnalysisSessionId { get; set; }
        public AnalysisSession LatestAnalysisSession { get; set; }

        public virtual IList<DocumentParagraph> Paragraphs { get; set; }
    }
}
