using BibleNote.Analytics.Models.Modules;
using BibleNote.Analytics.Models.Verse;
using System.Collections.Generic;

namespace BibleNote.Analytics.Contracts.ParallelVerses
{
    public interface IBibleParallelTranslationConnectorManager
    {
        ParallelBibleInfo GetParallelBibleInfo(string baseModuleShortName, string parallelModuleShortName, 
            BibleTranslationDifferences baseBookTranslationDifferences, BibleTranslationDifferences parallelBookTranslationDifferences, bool refreshCache = false);

        ParallelBibleInfo GetParallelBibleInfo(string baseModuleShortName, string parallelModuleShortName, bool refreshCache = false);

        List<ModuleVersePointer> GetParallelVersePointer(ModuleVersePointer baseVersePointer, string parallelModuleShortName);
    }
}
