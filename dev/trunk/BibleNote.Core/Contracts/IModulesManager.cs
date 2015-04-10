using BibleCommon.Scheme;
using BibleNote.Core.Common;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Core.Contracts
{
    public interface IModulesManager
    {
        void CheckModule(ModuleInfo module, BibleNote.Core.Common.ModuleType? moduleType = null);
        void CheckModule(string moduleDirectoryName, BibleNote.Core.Common.ModuleType? moduleType = null);
        void DeleteModule(string moduleShortName);
        int GetBibleChaptersCount(XMLBIBLE bibleInfo, bool addBooksCount);
        int GetBibleChaptersCount(string moduleShortName, bool addBooksCount);
        int? GetChapterVersesCount(XMLBIBLE bibleIndo, SimpleVersePointer chapterVersePointer);
        XMLBIBLE GetCurrentBibleContent();
        string GetCurrentModuleDirectiory();
        ModuleInfo GetCurrentModuleInfo();
        XMLBIBLE GetModuleBibleInfo(string moduleShortName);
        string GetModuleDirectory(string moduleShortName);
        ModuleInfo GetModuleInfo(string moduleShortName);
        System.Collections.Generic.List<ModuleInfo> GetModules(bool correctOnly);
        string GetModulesDirectory();
        string GetModulesPackagesDirectory();
        bool ModuleIsCorrect(string moduleName, BibleNote.Core.Common.ModuleType? moduleType = null);
        ModuleInfo ReadModuleInfo(string moduleFilePath);
        void UpdateModuleManifest(ModuleInfo moduleInfo);
        ModuleInfo UploadModule(string originalFilePath, string destFilePath, string moduleName);
    }
}
