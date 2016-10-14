using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BibleNote.Analytics.Data.Entities
{
    [Table("DocumentParagraphs")]
    public class DocumentParagraph
    {
        [Key, DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public int DocumentParagraphId { get; set; }

        public string Path { get; set; }

        [Required]
        public int DocumentId { get; set; }              

        [ForeignKey("DocumentId")]
        public virtual Document Document { get; set; }        
    }
}
