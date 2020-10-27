using System.Linq;
using BibleNote.Services.ModulesManager.Contracts;
using BibleNote.Services.ModulesManager.Models;
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

            ExpandVerse(versePointer, null);
            if (versePointer.SubVerses.Verses.Count == 0)
                return false;

            versePointer.UpdateTopVerseNumber(versePointer.SubVerses.Verses);

            return true;
        }

        /// <summary>
        /// You should be careful after call this method: versePointer can be in inconsistent state - IsMultiVerse and TopVerseNumber can return not actual information.
        /// </summary>
        /// <param name="versePointer"></param>
        private void ExpandVerse(VersePointer versePointer, string moduleShortName)
        {
            var bibleContent = string.IsNullOrEmpty(moduleShortName) 
                ? _applicationManager.CurrentBibleContent 
                : _applicationManager.GetBibleContent(moduleShortName);

            var bookContent = bibleContent.BooksDictionary[versePointer.BookIndex];
            for (var chapterIndex = versePointer.Chapter; chapterIndex <= versePointer.MostTopChapter; chapterIndex++)
            {
                if (bookContent.Chapters.Count < chapterIndex)
                {
                    versePointer.SubVerses.NotFoundVerses.Add(new ModuleVersePointer(versePointer.BookIndex, chapterIndex));
                    break;
                }

                var chapterContent = bookContent.Chapters[chapterIndex - 1];
                if ((versePointer.Chapter < chapterIndex
                            || (versePointer.VerseNumber.IsChapter && versePointer.Chapter == chapterIndex))
                    && (!versePointer.TopVerseNumber.HasValue 
                        || (chapterIndex < versePointer.MostTopChapter
                                || (versePointer.TopVerseNumber.Value.IsChapter && versePointer.MostTopChapter == chapterIndex))))
                {
                    versePointer.SubVerses.Verses.Add(new ModuleVersePointer(versePointer.BookIndex, chapterIndex));
                    versePointer.SubVerses.VersesCount += versePointer.IsChapter ? 1 : chapterContent.Verses.Count;
                }
                else
                {
                    var startVerse = chapterIndex == versePointer.Chapter ? versePointer.Verse : 1;
                    var endVerse = chapterIndex == versePointer.MostTopChapter ? versePointer.MostTopVerse : chapterContent.Verses.Count;

                    for (var verseIndex = startVerse; verseIndex <= endVerse; verseIndex++)
                    {
                        var verse = new ModuleVersePointer(versePointer.BookIndex, chapterIndex, verseIndex);
                        if (chapterContent.Verses.Count < verseIndex)
                        {
                            versePointer.SubVerses.NotFoundVerses.Add(verse);
                            break;
                        }

                        versePointer.SubVerses.Verses.Add(verse);
                        versePointer.SubVerses.VersesCount++;
                    }
                }
            }
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
            ExpandVerse(versePointer, versePointer.ModuleShortName);
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
