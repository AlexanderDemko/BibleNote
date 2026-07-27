using Extensibility;
using Microsoft.Office.Core;
using Microsoft.Win32;
using System;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Net;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Text;
using System.Threading;
using System.Windows.Forms;

namespace BibleNote.OneNoteRibbon
{
#if OFFICE2010
    [Guid("E4B377A1-53D3-48B4-9B29-41AA0D95E410")]
    [ProgId("BibleNote.OneNoteRibbon.Office2010")]
#elif OFFICE2013
    [Guid("E4B377A1-53D3-48B4-9B29-41AA0D95E413")]
    [ProgId("BibleNote.OneNoteRibbon.Office2013")]
#else
    [Guid("E4B377A1-53D3-48B4-9B29-41AA0D95E416")]
    [ProgId("BibleNote.OneNoteRibbon.Office2016")]
#endif
    [ComVisible(true)]
    [ClassInterface(ClassInterfaceType.AutoDispatch)]
    public class RibbonAddIn : IDTExtensibility2, IRibbonExtensibility
    {
        private const string SettingsKey = @"Software\BibleNote\OneNoteRibbon";

        private const string RibbonXml =
            "<?xml version=\"1.0\" encoding=\"utf-8\"?>" +
            "<customUI xmlns=\"http://schemas.microsoft.com/office/2006/01/customui\" loadImage=\"GetRibbonImage\">" +
            "<ribbon><tabs><tab id=\"BibleNoteTab\" label=\"BibleNote\">" +
            "<group id=\"BibleNoteCommandsGroup\" label=\"BibleNote\">" +
            "<button id=\"BibleNoteOpenBible\" label=\"Открыть Библию\" size=\"large\" " +
            "screentip=\"Открыть Библию в BibleNote.\" onAction=\"OnRibbonAction\" image=\"OpenBible.png\"/>" +
            "<button id=\"BibleNoteQuickAnalyze\" label=\"Распознать библейские ссылки\" " +
            "size=\"large\" screentip=\"Распознать библейские ссылки без синхронизации с BibleNote.\" " +
            "onAction=\"OnRibbonAction\" image=\"QuickAnalyze.png\"/>" +
            "<button id=\"BibleNoteAnalyzeCurrent\" label=\"Синхронизировать текущую страницу\" " +
            "size=\"large\" screentip=\"Синхронизировать текущую страницу с BibleNote.\" " +
            "onAction=\"OnRibbonAction\" image=\"AnalyzeCurrent.png\"/>" +
            "<button id=\"BibleNoteOpen\" label=\"Открыть в BibleNote\" size=\"large\" " +
            "screentip=\"Открыть текущую страницу в BibleNote.\" onAction=\"OnRibbonAction\" image=\"OpenBibleNote.png\"/>" +
            "</group></tab></tabs></ribbon></customUI>";

        public RibbonAddIn()
        {
            Log("Instance created: " + typeof(RibbonAddIn).Assembly.FullName);
        }

        public string GetCustomUI(string ribbonId)
        {
            Log("GetCustomUI: " + (ribbonId ?? "<null>"));
            return RibbonXml;
        }

        public IStream GetRibbonImage(string imageName)
        {
            try
            {
                var resourceName = typeof(RibbonAddIn).Namespace + ".Resources." + imageName;
                using (var resource = Assembly.GetExecutingAssembly().GetManifestResourceStream(resourceName))
                {
                    if (resource == null)
                    {
                        Log("Ribbon image not found: " + resourceName);
                        return null;
                    }

                    var memory = new MemoryStream();
                    resource.CopyTo(memory);
                    memory.Position = 0;
                    return new ComStreamWrapper(memory);
                }
            }
            catch (Exception exception)
            {
                Log("Ribbon image failed: " + imageName + ": " + exception);
                return null;
            }
        }

        public void OnRibbonAction(IRibbonControl control)
        {
            var action = ActionForControl(control);
            if (string.IsNullOrEmpty(action))
                return;

            ThreadPool.QueueUserWorkItem(_ => DispatchAction(action));
        }

        public void OnConnection(object application, ext_ConnectMode connectMode, object addInInstance, ref Array custom)
        {
            Log("OnConnection: " + connectMode);
        }

        public void OnDisconnection(ext_DisconnectMode disconnectMode, ref Array custom)
        {
            Log("OnDisconnection: " + disconnectMode);
        }

        public void OnAddInsUpdate(ref Array custom)
        {
        }

        public void OnStartupComplete(ref Array custom)
        {
        }

        public void OnBeginShutdown(ref Array custom)
        {
        }

        private static string ActionForControl(IRibbonControl control)
        {
            if (control == null)
                return null;

            try
            {
                switch (control.Id)
                {
                    case "BibleNoteOpenBible":
                        return "open-bible";
                    case "BibleNoteAnalyzeCurrent":
                        return "analyze-current";
                    case "BibleNoteQuickAnalyze":
                        return "quick-analyze";
                    case "BibleNoteOpen":
                        return "open";
                    default:
                        return null;
                }
            }
            catch
            {
                return null;
            }
        }

        private static void DispatchAction(string action)
        {
            if (TryPostToBibleNote(action))
                return;

            try
            {
                var executablePath = ReadSetting("ExecutablePath");
                if (string.IsNullOrWhiteSpace(executablePath) || !File.Exists(executablePath))
                    throw new FileNotFoundException("Не найден исполняемый файл BibleNote.", executablePath);

                Process.Start(new ProcessStartInfo
                {
                    FileName = executablePath,
                    Arguments = "--onenote-ribbon-action=" + action,
                    UseShellExecute = true
                });
            }
            catch (Exception exception)
            {
                MessageBox.Show(
                    "Не удалось выполнить команду BibleNote.\r\n\r\n" + exception.Message,
                    "BibleNote",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
            }
        }

        private static bool TryPostToBibleNote(string action)
        {
            try
            {
                var controlUrl = ReadSetting("ControlUrl");
                if (string.IsNullOrWhiteSpace(controlUrl))
                    controlUrl = "http://127.0.0.1:4313";

                var request = (HttpWebRequest)WebRequest.Create(
                    controlUrl.TrimEnd('/') + "/onenote-ribbon/" + action);
                request.Method = "POST";
                request.ContentLength = 0;
                request.Timeout = 1200;
                request.ReadWriteTimeout = 1200;
                request.Proxy = null;

                using (var response = (HttpWebResponse)request.GetResponse())
                    return (int)response.StatusCode >= 200 && (int)response.StatusCode < 300;
            }
            catch
            {
                return false;
            }
        }

        private static string ReadSetting(string name)
        {
            using (var key = Registry.CurrentUser.OpenSubKey(SettingsKey, false))
                return key == null ? null : Convert.ToString(key.GetValue(name), CultureInfo.InvariantCulture);
        }

        private static void Log(string message)
        {
            try
            {
                var directory = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "BibleNote",
                    "logs");
                Directory.CreateDirectory(directory);
                File.AppendAllText(
                    Path.Combine(directory, "onenote-ribbon.log"),
                    DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff", CultureInfo.InvariantCulture)
                        + " ["
                        + typeof(RibbonAddIn).Assembly.GetName().Name
                        + "] "
                        + message
                        + Environment.NewLine,
                    Encoding.UTF8);
            }
            catch
            {
            }
        }
    }
}
