namespace BibleNote.Analytics.Data.Entities
{
    public class VerseRelation
    {
        public int VerseRelationId { get; set; }

        public int VerseEntryId { get; set; }

        так здесь VerseEntryId или VerseId??

        public int RelativeVerseEntryId { get; set; }        

        public decimal RelationWeight { get; set; }        

        public virtual VerseEntry Verse { get; set; }

        public virtual VerseEntry RelativeVerse { get; set; }
    }
}
