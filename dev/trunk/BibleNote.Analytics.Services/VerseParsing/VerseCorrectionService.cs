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
            if (!string.IsNullOrEmpty(versePointer.ModuleShortName))            
                ConvertToMainModuleVerse(versePointer);

            if (VerseExists(versePointer))
            {
                ExpandVerse(versePointer, null);
                versePointer.UpdateTopVerseNumber(versePointer.SubVerses.VersePointers);

                return true;
            }

            return false;            
        }

        /// <summary>
        /// После вызова надо быть аккуратным, так как versePointer может находиться в неконсистентном состоянии: IsMultiVerse и TopVerseNumber могут возвращать неактуальную информацию.
        /// </summary>
        /// <param name="versePointer"></param>
        private void ExpandVerse(VersePointer versePointer, string moduleShortName)
        {
            if (versePointer.SubVerses == null)
                versePointer.SubVerses = new VersesListInfo<ModuleVersePointer>();            

            if (versePointer.IsMultiVerse == MultiVerse.None)
            {
                versePointer.SubVerses.VersePointers.Add(versePointer.ToModuleVersePointer());      // мы до этого в методе VerseExists() проверили существование стиха
                versePointer.SubVerses.VersesCount = 1;
                return;
            }

            var bibleContent = string.IsNullOrEmpty(moduleShortName) ? _applicationManager.CurrentBibleContent : _applicationManager.GetBibleContent(moduleShortName);
            var bookContent = bibleContent.BooksDictionary[versePointer.BookIndex];
            for (var chapterIndex = versePointer.Chapter; chapterIndex <= versePointer.MostTopChapter; chapterIndex++)
            {
                if (bookContent.Chapters.Count < chapterIndex)
                {
                    versePointer.SubVerses.NotFoundVersePointers.Add(new ModuleVersePointer(versePointer.BookIndex, chapterIndex));
                    break;
                }

                var chapterContent = bookContent.Chapters[chapterIndex - 1];
                if ((versePointer.Chapter < chapterIndex
                            || (versePointer.VerseNumber.IsChapter && versePointer.Chapter == chapterIndex))
                    && (chapterIndex < versePointer.MostTopChapter
                            || (versePointer.TopVerseNumber.Value.IsChapter && versePointer.MostTopChapter == chapterIndex)))
                {
                    versePointer.SubVerses.VersePointers.Add(new ModuleVersePointer(versePointer.BookIndex, chapterIndex));
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
                            versePointer.SubVerses.NotFoundVersePointers.Add(verse);
                            break;
                        }

                        versePointer.SubVerses.VersePointers.Add(verse);
                        versePointer.SubVerses.VersesCount++;
                    }
                }
            }
        }

        /// <summary>
        /// Проверяем только первый стих, если IsMultiVerse
        /// Метод важен не только для проверки существования стиха, но и для исправления, если стих типа "Иуд 5"
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
            ExpandVerse(versePointer, versePointer.ModuleShortName);

            var parallelVersePointers = _bibleParallelTranslationConnectorManager.GetParallelVersePointer(
                                                versePointer.SubVerses.VersePointers.First(), versePointer.ModuleShortName);

            versePointer.VerseNumber = parallelVersePointers.First().VerseNumber;

            if (versePointer.SubVerses.VersePointers.Count == 1)
            {
                versePointer.UpdateTopVerseNumber(parallelVersePointers);                
            }
            else
            {
                parallelVersePointers = _bibleParallelTranslationConnectorManager.GetParallelVersePointer(
                                            versePointer.SubVerses.VersePointers.Last(), versePointer.ModuleShortName);

                versePointer.TopVerseNumber = parallelVersePointers.Last().VerseNumber;
            }

            versePointer.SubVerses.Clear();
        }
    }
}
