using System.Collections.Generic;
using BibleNote.Services.ModulesManager.Scheme.Module;

namespace BibleNote.Services.ParallelVerses.Contracts
{
    public interface IBibleParallelTranslationManager
    {
        void MergeAllModulesWithMainBible(ModuleInfo baseModule, IEnumerable<ModuleInfo> otherModules);

        bool MergeModuleWithMainBible(ModuleInfo baseModuleInfo, ModuleInfo parallelModuleInfo);

        void RemoveBookAbbreviationsFromMainBible(ModuleInfo baseModuleInfo, string parallelModuleName, bool removeAllParallelModulesAbbriviations);
    }
}
