using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BibleNote.Analytics.Data.Entities
{
    [Table("VerseRelations")]
    public class VerseRelation
    {
        [Key, DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public int VerseRelationId { get; set; }

        [Index("IX_VerseId")]
        public long VerseId { get; set; }

        [Index("IX_RelativeVerseId")]
        public long RelativeVerseId { get; set; }        
        
        public int DocumentParagraphId { get; set; }        

        public int? RelativeDocumentParagraphId { get; set; }

        public decimal RelationWeight { get; set; }        

        [ForeignKey("DocumentParagraphId")]
        public virtual DocumentParagraph DocumentParagraph { get; set; }

        [ForeignKey("RelativeDocumentParagraphId")]
        public virtual DocumentParagraph RelativeDocumentParagraph { get; set; }
    }
}
