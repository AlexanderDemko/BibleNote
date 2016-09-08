using BibleNote.Analytics.Contracts.VerseParsing;
using BibleNote.Analytics.Models.VerseParsing;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Services.VerseParsing
{
    public class ParagraphParseContext : IParagraphParseContextEditor
    {
        public VerseEntryInfo LatestVerseEntry { get; private set; }

        public ParagraphParseResult ParagraphParseResult { get; private set; }

        public void SetLatestVerseEntry(VerseEntryInfo verseEntry)
        {
            LatestVerseEntry = verseEntry;
        }

        public void SetParagraphResult(ParagraphParseResult paragraphParseResult)
        {
            ParagraphParseResult = paragraphParseResult;
        }
    }
}
