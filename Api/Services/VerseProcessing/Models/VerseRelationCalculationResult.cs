using System.Collections.Generic;
using BibleNote.Services.VerseParsing.Models.ParseResult;

namespace BibleNote.Services.VerseProcessing.Models
{
    public class CalculatedVerseRelation
    {
        public long VerseId { get; set; }

        public long RelativeVerseId { get; set; }

        public ParagraphParseResult Paragraph { get; set; }

        public ParagraphParseResult RelativeParagraph { get; set; }

        public int ReferenceIndex { get; set; }

        public int RelativeReferenceIndex { get; set; }

        public decimal RelationWeight { get; set; }
    }

    public class VerseRelationCalculationResult
    {
        public List<CalculatedVerseRelation> Relations { get; } = new List<CalculatedVerseRelation>();

        public bool Capped { get; set; }
    }
}
