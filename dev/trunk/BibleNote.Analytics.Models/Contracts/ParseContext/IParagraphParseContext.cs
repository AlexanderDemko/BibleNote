using BibleNote.Analytics.Models.VerseParsing;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using BibleNote.Analytics.Models.Verse;

namespace BibleNote.Analytics.Models.Contracts.ParseContext
{
    public interface IParagraphParseContext
    {
        ParagraphParseResult ParseResult { get; }

        VerseEntry LatestVerseEntry { get; }

        /// <summary>
        /// В рамках текущей IHierarchyElementParseContext
        /// </summary>
        IParagraphParseContext PreviousSibling { get; }

        ChapterEntry GetPreviousChapter();
    }

    public interface IParagraphParseContextEditor : IParagraphParseContext
    { 
        void SetLatestVerseEntry(VerseEntry verseEntry);

        void SetParagraphResult(ParagraphParseResult paragraphParseResult);

        void SetParsed();
    }
}
