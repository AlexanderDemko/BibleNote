namespace BibleNote.Analytics.Data.Entities
{
    public class VerseRelation
    {
        public int VerseRelationId { get; set; }

        public long VerseId { get; set; }

        public long RelativeVerseId { get; set; }        
        
        public int DocumentParagraphId { get; set; }        

        public int? RelativeDocumentParagraphId { get; set; }

        public decimal RelationWeight { get; set; }        

        public virtual DocumentParagraph DocumentParagraph { get; set; }

        public virtual DocumentParagraph RelativeDocumentParagraph { get; set; }
    }
}
