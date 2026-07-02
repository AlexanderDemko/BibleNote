using System;
using System.Linq;
using BibleNote.Services.ModulesManager.Contracts;
using BibleNote.Services.ModulesManager.Models;
using BibleNote.Services.VerseParsing.Contracts;
using BibleNote.Services.VerseParsing.Models;

namespace BibleNote.Services.VerseParsing
{
    class VersePointerFactory : IVersePointerFactory
    {
        private readonly IStringParser _stringParser;
        private readonly IModulesManager _modulesManager;
        private readonly IVerseCorrectionService _verseCorrectionService;
        private readonly IApplicationManager _applicationManager;

        public VersePointerFactory(
            IStringParser stringParser, 
            IModulesManager modulesManager,
            IVerseCorrectionService verseCorrectionService,
            IApplicationManager applicationManager)
        {
            _stringParser = stringParser;
            _modulesManager = modulesManager;
            _verseCorrectionService = verseCorrectionService;
            _applicationManager = applicationManager;
        }

        // rst/43 2:3-12
        public VersePointer CreateVersePointerFromLink(string verseLink)
        {
            var parts = verseLink.Split(new char[] { '/', ' ', '-'}, StringSplitOptions.RemoveEmptyEntries);
            var moduleShortName = parts[0];
            var bibleBookIndex = int.Parse(parts[1]);
            var verseNumber = VerseNumber.Parse(parts[2]);
            var topVerseNumber = parts.Length > 3 
                ? (VerseNumber?)VerseNumber.ParseTopVerseNumber(parts[3], verseNumber) 
                : null;

            var bookInfo = _modulesManager.GetModuleInfo(moduleShortName).BibleStructure.BibleBooks
                .Single(b => b.Index == bibleBookIndex);

            var versePointer = new VersePointer(bookInfo, moduleShortName, verseLink, verseNumber, topVerseNumber);
            
            versePointer.ExpandVerse(_applicationManager.GetBibleContent(moduleShortName));
            versePointer.UpdateTopVerseNumber(versePointer.SubVerses.Verses);

            return versePointer;
        }

        public VersePointer CreateVersePointer(string text)
        {
            var verseEntry = _stringParser.TryGetVerse(text, 0);
            if (verseEntry.VersePointerFound
                && (verseEntry.EntryType == VerseEntryType.BookChapter || verseEntry.EntryType == VerseEntryType.BookChapterVerse)
                && verseEntry.StartIndex == 0
                //&& verseEntry.EndIndex == text.Length - 1
                )
            {
                return verseEntry.VersePointer;
            }

            return null;
        }
    }
}
