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
        private static List<Func<VerseEntryInfo, DocumentParseContext, VersePointer>> _funcs = new List<Func<VerseEntryInfo, DocumentParseContext, VersePointer>>() 
        { 
            FullVerseRule 
        };

        public VersePointer TryRecognizeVerse(VerseEntryInfo verseEntry, DocumentParseContext docParseContext)
        {
            if (!verseEntry.VersePointerFound)
                return null;

            foreach (var func in _funcs)
            {
                var recognizedVerse = func(verseEntry, docParseContext);
                if (recognizedVerse != null)                                    
                    return recognizedVerse;                
            }

            return null;
        }

        private static VersePointer FullVerseRule(VerseEntryInfo verseEntry, DocumentParseContext docParseContext)
        {
            if (verseEntry.EntryType == VerseEntryType.BookChapter || verseEntry.EntryType == VerseEntryType.BookChapterVerse)
                return verseEntry.VersePointer;   
         
            return null;
        }
    }
}
