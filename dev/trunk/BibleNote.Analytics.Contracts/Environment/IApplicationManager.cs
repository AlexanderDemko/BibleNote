using BibleNote.Analytics.Models.Modules;
using BibleNote.Analytics.Models.Scheme;

namespace BibleNote.Analytics.Contracts.Environment
{
    public interface IApplicationManager
    {
        ModuleInfo CurrentModuleInfo { get; }

        XMLBIBLE CurrentBibleContent { get; }

        XMLBIBLE GetBibleContent(string moduleShortName);

        void ReloadInfo();
    }
}
