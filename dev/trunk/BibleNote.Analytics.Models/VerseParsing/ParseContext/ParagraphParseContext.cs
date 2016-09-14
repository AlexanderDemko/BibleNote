using System;
using BibleNote.Analytics.Models.Contracts.ParseContext;

namespace BibleNote.Analytics.Models.VerseParsing.ParseContext
{
    public class ParagraphParseContext : IParagraphParseContextEditor
    {
        public VerseEntry LatestVerseEntry { get; private set; }

        public ParagraphParseResult ParseResult { get; private set; }

        public IElementParseContext PreviousSibling { get; private set; }

        public ElementType ElementType { get { return ElementType.Linear; } }

        public ChapterEntry ChapterEntry { get { return ParseResult.ChapterEntry; } }

        public ParagraphParseContext(IElementParseContext previousSibling)
        {
            PreviousSibling = previousSibling;
        }

        public void SetLatestVerseEntry(VerseEntry verseEntry)
        {
            LatestVerseEntry = verseEntry;
        }

        public void SetParagraphResult(ParagraphParseResult paragraphParseResult)
        {
            ParseResult = paragraphParseResult;
        }

        public ChapterEntry GetHierarchyChapterEntry()
        {
            if (ParseResult.ChapterEntry?.AtStartOfParagraph == true)
            {
                if (ParseResult.ChapterEntry?.Valid == true)
                    return ParseResult.ChapterEntry;
                else 
                    return null;
            }            

            return PreviousSibling?.GetHierarchyChapterEntry();                            
        }

        public void SetParsed()
        {
            ParseResult.Parsed = true;
        }
    }
}
