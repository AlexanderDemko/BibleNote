using System.Linq;
using BibleNote.Services.ModulesManager.Contracts;
using BibleNote.Services.ModulesManager.Models;
using BibleNote.Services.ModulesManager.Scheme.ZefaniaXml;
using BibleNote.Services.ParallelVerses.Contracts;
using BibleNote.Services.VerseParsing.Contracts;
using BibleNote.Services.VerseParsing.Models;

namespace BibleNote.Services.VerseParsing
{
    class VerseCorrectionService : IVerseCorrectionService
    {
        private readonly IBibleParallelTranslationConnectorManager _bibleParallelTranslationConnectorManager;
        private readonly IApplicationManager _applicationManager;        

        public VerseCorrectionService(
            IBibleParallelTranslationConnectorManager bibleParallelTranslationConnectorManager, 
            IApplicationManager applicationManager)
        {
            _bibleParallelTranslationConnectorManager = bibleParallelTranslationConnectorManager;
            _applicationManager = applicationManager;
        }

        public bool CheckAndCorrectVerse(VersePointer versePointer)
        {
            if (versePointer.Chapter == 0)
                return false;

            ChangeIfOneChapterBook(versePointer);

            if (!string.IsNullOrEmpty(versePointer.ModuleShortName))
                if (!ConvertToMainModuleVerse(versePointer))
                    return false;
            
            versePointer.ExpandVerse(_applicationManager.CurrentBibleContent);
            if (versePointer.SubVerses.Verses.Count == 0)
                return false;

            versePointer.UpdateTopVerseNumber(versePointer.SubVerses.Verses);

            return true;
        }

        private void ChangeIfOneChapterBook(VersePointer versePointer)
        {
            var bibleContent = string.IsNullOrEmpty(versePointer.ModuleShortName) 
                ? _applicationManager.CurrentBibleContent 
                : _applicationManager.GetBibleContent(versePointer.ModuleShortName);

            var bookContent = bibleContent.BooksDictionary[versePointer.BookIndex];
            
            if (bookContent.Chapters.Count == 1 && versePointer.VerseNumber.IsChapter && versePointer.Chapter > 1)
            {
                if (versePointer.Chapter <= bookContent.Chapters[0].Verses.Count)
                    versePointer.MoveChapterToVerse(1);
            }
        }

        private bool ConvertToMainModuleVerse(VersePointer versePointer)
        {
            versePointer.ExpandVerse(_applicationManager.GetBibleContent(versePointer.ModuleShortName));
            if (versePointer.SubVerses.Verses.Count == 0)
                return false;

            var parallelVersePointers = _bibleParallelTranslationConnectorManager.GetParallelVersePointer(
                                                versePointer.SubVerses.Verses.First(), versePointer.ModuleShortName);

            versePointer.OriginalVerseNumber = versePointer.VerseNumber;
            versePointer.OriginalTopVerseNumber = versePointer.TopVerseNumber;

            versePointer.VerseNumber = parallelVersePointers.First().VerseNumber;

            if (versePointer.SubVerses.Verses.Count == 1)
            {
                versePointer.UpdateTopVerseNumber(parallelVersePointers);                
            }
            else
            {
                parallelVersePointers = _bibleParallelTranslationConnectorManager.GetParallelVersePointer(
                                            versePointer.SubVerses.Verses.Last(), versePointer.ModuleShortName);

                versePointer.TopVerseNumber = parallelVersePointers.Last().VerseNumber;
            }

            versePointer.SubVerses.Clear();
            return true;
        }
    }
}
