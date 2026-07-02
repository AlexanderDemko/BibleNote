using System.Linq;
using System.Threading.Tasks;

namespace BibleNote.Infrastructure.Electron
{
    public static class ElectronUtils
    {
        public static Task ExecuteJavascript(string code)
        {
            var window = ElectronNET.API.Electron.WindowManager.BrowserWindows.First();
            var url = $"javascript:{code}";
            return window.WebContents.LoadURLAsync(url);
        }
    }
}
