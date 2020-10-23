using BibleNote.Analytics.Services.ModulesManager.Scheme.Module;
using System.Collections.Generic;

namespace BibleNote.Analytics.Services.ParallelVerses.Contracts
{
    public interface IBibleParallelTranslationManager
    {
        void MergeAllModulesWithMainBible(ModuleInfo baseModule, IEnumerable<ModuleInfo> otherModules);

        bool MergeModuleWithMainBible(ModuleInfo baseModuleInfo, ModuleInfo parallelModuleInfo);

        void RemoveBookAbbreviationsFromMainBible(ModuleInfo baseModuleInfo, string parallelModuleName, bool removeAllParallelModulesAbbriviations);
    }
}
