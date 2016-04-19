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
        private IBibleParallelTranslationConnectorManager _bibleParallelTranslationConnectorManager;        

        public VerseCorrectionService(IBibleParallelTranslationConnectorManager bibleParallelTranslationConnectorManager)
        {
            _bibleParallelTranslationConnectorManager = bibleParallelTranslationConnectorManager;            
        }

        public bool CheckAndCorrectVerse(VersePointer versePointer)
        {
            var verseIsCorrect = true;

            if (!string.IsNullOrEmpty(versePointer.ModuleName))            
                ConvertToMainModuleVerse(versePointer);                            

            return verseIsCorrect;
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
