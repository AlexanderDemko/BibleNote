using BibleNote.Analytics.Common.Contracts;
using System;

namespace BibleNote.Analytics.Data.Entities
{
    public class VerseRelation : ICloneable<VerseRelation>
    {
        public int Id { get; set; }

        public long VerseId { get; set; }

        public long RelativeVerseId { get; set; }

        public int DocumentParagraphId { get; set; }

        public int? RelativeDocumentParagraphId { get; set; }

        public decimal RelationWeight { get; set; }

        public virtual DocumentParagraph DocumentParagraph { get; set; }

        public virtual DocumentParagraph RelativeDocumentParagraph { get; set; }

        public VerseRelation Clone()
        {
            return new VerseRelation()
            {
                VerseId = VerseId,
                RelativeVerseId = RelativeVerseId,
                DocumentParagraphId = DocumentParagraphId,
                DocumentParagraph = DocumentParagraph,
                RelativeDocumentParagraphId = RelativeDocumentParagraphId,
                RelativeDocumentParagraph = RelativeDocumentParagraph,
                RelationWeight = RelationWeight
            };
        }
    }
}
