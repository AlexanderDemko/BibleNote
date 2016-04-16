using BibleNote.Analytics.Contracts.VerseParsing;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using BibleNote.Analytics.Models.Common;
using BibleNote.Analytics.Contracts.ParallelVerses;

namespace BibleNote.Analytics.Services.VerseParsing
{
    public class VerseCorrectionService : IVerseCorrectionService
    {
        private IBibleParallelTranslationConnectorManager _bibleParallelTranslationConnectorManager;

        public VerseCorrectionService(IBibleParallelTranslationConnectorManager bibleParallelTranslationConnectorManager)
        {
            _bibleParallelTranslationConnectorManager = bibleParallelTranslationConnectorManager;
        }

        public void ConvertToMainModuleVerse(VersePointer versePointer)
        {
            //if (!string.IsNullOrEmpty(versePointer.ModuleName))
            //{
            //    var parallelVersePointer = _bibleParallelTranslationConnectorManager.GetParallelVersePointer(
            //                                    ToSimpleVersePointer(), moduleName, SettingsManager.Instance.ModuleShortName);

            //    versePointer.OriginalBookName = this.Book.Name;
            //    this.Chapter = parallelVersePointer.Chapter;
            //    this.Verse = parallelVersePointer.Verse;

            //    if (IsMultiVerse)
            //    {
            //        parallelVersePointer = _bibleParallelTranslationConnectorManager.GetParallelVersePointer(
            //                                    new SimpleVersePointer(
            //                                                        this.Book.Index,
            //                                                        this.TopChapter.GetValueOrDefault(this.Chapter.Value),
            //                                                        new VerseNumber(this.TopVerse.GetValueOrDefault(this.Verse.Value))),
            //                                    moduleName, SettingsManager.Instance.ModuleShortName);

            //        if (TopChapter.HasValue)
            //            _topChapter = parallelVersePointer.Chapter;
            //        if (TopVerse.HasValue)
            //            _topVerse = parallelVersePointer.Verse;
            //    }
            //}
        }
    }
}
