using BibleNote.Analytics.Contracts.VerseParsing;
using BibleNote.Analytics.Models.Common;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Services.VerseParsing
{
    public class VerseRecognitionService : IVerseRecognitionService
    {
        protected bool VerseRecognized { get; set; }

        public VersePointer TryRecognizeVerse(VerseEntryInfo verseEntry, DocumentParseContext docParseContext)
        {
            if (!verseEntry.VersePointerFound)
                return null;
            return verseEntry.VersePointer;

            //return FullVerseRule(verseEntry, docParseContext);
        }

        private VerseRecognitionService FullVerseRule(VerseEntryInfo verseEntry, DocumentParseContext docParseContext)
        {
            //if (verseEntry.EntryType == VerseEntryType.BookChapter || verseEntry.EntryType == VerseEntryType.BookChapterVerse)
            //    return verseEntry.VersePointer;

            return this;
        }
    }
}
