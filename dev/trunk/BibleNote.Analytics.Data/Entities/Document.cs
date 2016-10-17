using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BibleNote.Analytics.Data.Entities
{    
    [Table(nameof(AnalyticsContext.Documents))]
    public class Document
    {
        [Key, DatabaseGenerated(DatabaseGeneratedOption.Identity)] 
        public int DocumentId { get; set; }

        [Required]
        public string Name { get; set; }

        [Required]
        public string Path { get; set; }

        public decimal Weight { get; set; }

        [Required]
        public int DocumentFolderId { get; set; }

        [ForeignKey(nameof(DocumentFolderId))]
        public DocumentFolder Folder { get; set; }

        public virtual IList<DocumentParagraph> Paragraphs { get; set; }
    }
}
