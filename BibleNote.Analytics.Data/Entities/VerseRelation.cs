using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BibleNote.Analytics.Data.Entities
{
    [Table(nameof(AnalyticsContext.VerseRelations))]
    public class VerseRelation
    {
        [Key, DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public int VerseRelationId { get; set; }

        [Index]
        public long VerseId { get; set; }

        [Index]
        public long RelativeVerseId { get; set; }        
        
        public int DocumentParagraphId { get; set; }        

        public int? RelativeDocumentParagraphId { get; set; }

        public decimal RelationWeight { get; set; }        

        [ForeignKey(nameof(DocumentParagraphId))]
        public virtual DocumentParagraph DocumentParagraph { get; set; }

        [ForeignKey(nameof(RelativeDocumentParagraphId))]
        public virtual DocumentParagraph RelativeDocumentParagraph { get; set; }
    }
}
