namespace BibleNote.Analytics.Data.Entities
{
    public class VerseRelation
    {
        public int VerseRelationId { get; set; }

        public int VerseId { get; set; }

        public int RelativeVerseId { get; set; }        

        public decimal RelationWeight { get; set; }        

        public virtual VerseEntry Verse { get; set; }

        public virtual VerseEntry RelativeVerse { get; set; }
    }
}
