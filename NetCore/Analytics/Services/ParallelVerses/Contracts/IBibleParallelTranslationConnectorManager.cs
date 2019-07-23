using BibleNote.Analytics.Services.ModulesManager.Models;
using BibleNote.Analytics.Services.ModulesManager.Scheme.Module;
using System.Collections.Generic;

namespace BibleNote.Analytics.Services.ParallelVerses.Contracts
{
    public interface IBibleParallelTranslationConnectorManager
    {
        ParallelBibleInfo GetParallelBibleInfo(
            string baseModuleShortName, 
            string parallelModuleShortName, 
            BibleTranslationDifferences baseBookTranslationDifferences, 
            BibleTranslationDifferences parallelBookTranslationDifferences, bool refreshCache = false);

        ParallelBibleInfo GetParallelBibleInfo(string baseModuleShortName, string parallelModuleShortName, bool refreshCache = false);

        List<ModuleVersePointer> GetParallelVersePointer(ModuleVersePointer baseVersePointer, string parallelModuleShortName);
    }
}
