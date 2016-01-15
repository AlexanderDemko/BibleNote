using BibleNote.Analytics.Models.Common;
using System;
using System.Collections.Generic;

namespace BibleNote.Analytics.Contracts.ParallelVerses
{
    public interface IBibleParallelTranslationManager
    {
        void MergeAllModulesWithMainBible(ModuleInfo baseModule, IEnumerable<ModuleInfo> otherModules);
        bool MergeModuleWithMainBible(ModuleInfo baseModuleInfo, ModuleInfo parallelModuleInfo);
        void RemoveBookAbbreviationsFromMainBible(ModuleInfo baseModuleInfo, string parallelModuleName, bool removeAllParallelModulesAbbriviations);
    }
}
