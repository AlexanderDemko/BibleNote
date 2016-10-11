using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BibleNote.Analytics.Data.Entities
{
    [Table("VerseEntries")]
    public class VerseEntry
    {
        [Key, DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public int VerseEntryId { get; set; }

        [Required]
        public long VerseId { get; set; }

        public decimal Weight { get; set; }

        [Required]
        public int DocumentId { get; set; }

        [Required]
        public int DocumentParagraphId { get; set; }        

        [ForeignKey("DocumentId")]
        public virtual Document Document { get; set; }

        [ForeignKey("DocumentParagraphId")]
        public virtual DocumentParagraph DocumentParagraph { get; set; }
    }
}
