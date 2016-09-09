using BibleNote.Analytics.Models.VerseParsing;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Contracts.VerseParsing.ParseContext
{
    public interface IParagraphParseContext
    {
        ParagraphParseResult ParagraphParseResult { get; }

        VerseEntryInfo LatestVerseEntry { get; }
    }

    public interface IParagraphParseContextEditor : IParagraphParseContext
    { 
        void SetLatestVerseEntry(VerseEntryInfo verseEntry);

        void SetParagraphResult(ParagraphParseResult paragraphParseResult);
    }
}
