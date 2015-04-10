using BibleNote.Core.Common;
using System;
namespace BibleNote.Core.Contracts
{
    public interface IBibleParallelTranslationManager
    {
        void MergeAllModulesWithMainBible();
        bool MergeModuleWithMainBible(ModuleInfo parallelModuleInfo);
        void RemoveBookAbbreviationsFromMainBible(string parallelModuleName, bool removeAllParallelModulesAbbriviations);
    }
}
