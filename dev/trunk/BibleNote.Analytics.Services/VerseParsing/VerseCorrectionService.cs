using BibleNote.Analytics.Contracts.VerseParsing;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using BibleNote.Analytics.Models.Common;
using BibleNote.Analytics.Contracts.ParallelVerses;
using BibleNote.Analytics.Contracts.Environment;

namespace BibleNote.Analytics.Services.VerseParsing
{
    public class VerseCorrectionService : IVerseCorrectionService
    {
        private readonly IBibleParallelTranslationConnectorManager _bibleParallelTranslationConnectorManager;
        private readonly IApplicationManager _applicationManager;

        public VerseCorrectionService(IBibleParallelTranslationConnectorManager bibleParallelTranslationConnectorManager, IApplicationManager applicationManager)
        {
            _bibleParallelTranslationConnectorManager = bibleParallelTranslationConnectorManager;
            _applicationManager = applicationManager;
        }

        public bool CheckAndCorrectVerse(VersePointer versePointer)
        {
            if (!string.IsNullOrEmpty(versePointer.ModuleName))            
                ConvertToMainModuleVerse(versePointer);

            if (!VerseExists(versePointer))
                return false;            

            return true;
        }

        /// <summary>
        /// Проверяем только первый стих, если IsMultiVerse
        /// </summary>
        /// <param name="versePointer"></param>
        /// <returns></returns>
        private bool VerseExists(VersePointer versePointer)
        {
            if (_applicationManager.CurrentBibleContent.BooksDictionary.ContainsKey(versePointer.BookIndex))
            {
                var book = _applicationManager.CurrentBibleContent.BooksDictionary[versePointer.BookIndex];
                if (0 < versePointer.Chapter && versePointer.Chapter <= book.Chapters.Count)
                {
                    if (versePointer.VerseNumber.IsChapter 
                        || versePointer.Verse <= book.Chapters[versePointer.Chapter - 1].Verses.Count)
                        return true;
                }                
                else
                {
                    if (book.Chapters.Count == 1 && versePointer.VerseNumber.IsChapter)
                    {
                        if (versePointer.Chapter <= book.Chapters[0].Verses.Count)
                        {
                            versePointer.MoveChapterToVerse(1);
                            return true;
                        }
                    }
                }
            }

            return false;
        }

        private void ConvertToMainModuleVerse(VersePointer versePointer)
        {
            var parallelVersePointer = _bibleParallelTranslationConnectorManager.GetParallelVersePointer(
                                                versePointer.ToModuleVersePointer(true), versePointer.ModuleName);

            versePointer.VerseNumber = parallelVersePointer.VerseNumber;                

            if (versePointer.IsMultiVerse != MultiVerse.None)
            {
                parallelVersePointer = _bibleParallelTranslationConnectorManager.GetParallelVersePointer(
                                            versePointer.ToModuleTopVersePointer(), versePointer.ModuleName);

                versePointer.TopVerseNumber = parallelVersePointer.VerseNumber;
            }
        }
    }
}
