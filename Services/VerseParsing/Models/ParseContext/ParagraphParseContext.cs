using BibleNote.Services.VerseParsing.Contracts.ParseContext;
using BibleNote.Services.VerseParsing.Models.ParseResult;

namespace BibleNote.Services.VerseParsing.Models.ParseContext
{
    public class ParagraphParseContext : IParagraphParseContextEditor
    {
        public VerseEntry LatestVerseEntry { get; private set; }

        public ParagraphParseResult ParseResult { get; private set; }

        public IElementParseContext PreviousSibling { get; private set; }

        public ElementType ElementType { get { return ElementType.SimpleBlock; } }

        public ChapterEntry ChapterEntry { get { return ParseResult.ChapterEntry; } }

        public ParagraphParseContext(IElementParseContext previousSibling, int currentParagraphIndex)
        {
            PreviousSibling = previousSibling;
            ParseResult = new ParagraphParseResult() { ParagraphIndex = currentParagraphIndex };               
        }

        public void SetLatestVerseEntry(VerseEntry verseEntry)
        {
            LatestVerseEntry = verseEntry;

            ParseResult.VersesCount += verseEntry.VersePointer.SubVerses.VersesCount;
        }

        public ChapterEntry GetHierarchyChapterEntry()
        {
            if (ParseResult.ChapterEntry != null 
                && ParseResult.ChapterEntry.AtStartOfParagraph 
                && (ParseResult.ChapterEntry.Found || ParseResult.ChapterEntry.Invalid))
                return ParseResult.ChapterEntry;

            return PreviousSibling?.GetHierarchyChapterEntry();                            
        }

        public void SetParsed()
        {
            ParseResult.Parsed = true;
        }
    }
}
