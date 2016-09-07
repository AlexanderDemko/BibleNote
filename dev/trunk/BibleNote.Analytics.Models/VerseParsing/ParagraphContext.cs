
namespace BibleNote.Analytics.Models.VerseParsing
{
    public enum ParagraphState
    {
        ListElement,
        Simple,
        Title,
        Table,
        TableHeader,
        TableFirstColumn,
        TableCell,
        List        
    }

    public class ParagraphContext
    {
        public ParagraphState ParagraphState { get; set; }

        public int ParagraphPosition { get; set; }

        public ParagraphParseResult ParseResult { get; set; }

        public ParagraphContext ParentParagraph { get; set; }

        public ParagraphContext(ParagraphState paragraphState, ParagraphContext parentParagraph)
        {
            ParagraphState = paragraphState;
            ParentParagraph = parentParagraph;
        }
    }
}