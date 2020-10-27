using System.Collections.Generic;
using BibleNote.Services.ModulesManager.Models;
using BibleNote.Services.ModulesManager.Scheme.Module;

namespace BibleNote.Services.ParallelVerses.Contracts
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
