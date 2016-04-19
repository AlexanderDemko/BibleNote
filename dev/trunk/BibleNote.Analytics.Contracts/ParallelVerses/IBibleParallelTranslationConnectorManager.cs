using BibleNote.Analytics.Models.Common;
using System;

namespace BibleNote.Analytics.Contracts.ParallelVerses
{
    public interface IBibleParallelTranslationConnectorManager
    {
        ParallelBibleInfo GetParallelBibleInfo(string baseModuleShortName, string parallelModuleShortName, 
            BibleTranslationDifferences baseBookTranslationDifferences, BibleTranslationDifferences parallelBookTranslationDifferences, bool refreshCache = false);

        ParallelBibleInfo GetParallelBibleInfo(string baseModuleShortName, string parallelModuleShortName, bool refreshCache = false);

        ModuleVersePointer GetParallelVersePointer(ModuleVersePointer baseVersePointer, string parallelModuleShortName);
    }
}
