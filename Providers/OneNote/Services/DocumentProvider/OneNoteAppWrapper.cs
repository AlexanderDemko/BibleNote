using BibleNote.Analytics.Providers.OneNote.Constants;
using System.Xml.XPath;
using Microsoft.Office.Interop.OneNote;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Runtime.InteropServices;
using System.Xml.Linq;
using System.Xml;
using System.Globalization;
using Microsoft.Extensions.Logging;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Providers.OneNote.Services.DocumentProvider
{
    public class OneNoteAppWrapper : IDisposable
    {
        // todo: не надо каждый раз создавать. Надо на уровне NavigationProvider-a один раз только создать.
        private IApplication _app;

        private readonly ILogger _log;

        public OneNoteAppWrapper(ILogger log)
        {
            _log = log;
        }

        public async Task<string> GetPageContentAsync(string pageId, PageInfo pageInfo = PageInfo.piBasic)
        {
            string result = null;

            await UseOneNoteAppAsync(() => _app.GetPageContent(pageId, out result, pageInfo, OneNoteConstants.CurrentOneNoteSchema));

            return result;
        }

        public async Task<string> GetCurrentPageIdAsync()
        {
            string currentPageId = null;

            await UseOneNoteAppAsync(() =>
            {
                //if (_app.Windows.CurrentWindow == null)
                //    throw new ProgramException(BibleCommon.Resources.Constants.Error_OpenedNotebookNotFound);

                currentPageId = _app.Windows.CurrentWindow?.CurrentPageId;
                //if (string.IsNullOrEmpty(currentPageId))
                //    throw new ProgramException(BibleCommon.Resources.Constants.Error_OpenedNotePageNotFound);                
            });

            return currentPageId;
        }

        public void Dispose()
        {
            ReleaseOneNoteApp();        // todo: и не надо каждый раз удалять
        }

        public async Task UpdatePageContentAsync(XDocument pageDoc)
        {
            var xnm = GetOneNoteXNM();

            CleanPageContent(pageDoc, xnm);

            await UseOneNoteAppAsync(() => _app.UpdatePageContent(pageDoc.ToString(), DateTime.MinValue, OneNoteConstants.CurrentOneNoteSchema));
        }

        private void CleanPageContent(XDocument pageContent, XmlNamespaceManager xnm)
        {
            try
            {
                var pageTitleEl = pageContent.Root.XPathSelectElement("one:Title", xnm);                // могли случайно удалить заголовок со страницы
                if (pageTitleEl != null && !pageTitleEl.HasElements && !pageTitleEl.HasAttributes)
                    pageTitleEl.Remove();

                var inkNodes = pageContent.Root.XPathSelectElements("one:InkDrawing", xnm)
                                .Union(pageContent.Root.XPathSelectElements("//one:OE[.//one:InkDrawing]", xnm))
                                .Union(pageContent.Root.XPathSelectElements("one:Outline[.//one:InkWord]", xnm)).ToList();
                foreach (var inkNode in inkNodes)
                {
                    if (inkNode.XPathSelectElement(".//one:T", xnm) == null)
                        inkNode.Remove();
                    else
                    {
                        var inkWords = inkNode.XPathSelectElements(".//one:InkWord", xnm).Where(ink => ink.XPathSelectElement(".//one:CallbackID", xnm) == null).ToList();
                        inkWords.Remove();
                    }
                }

                var indentNodes = pageContent.Root.XPathSelectElements("//one:Indents/one:Indent", xnm).ToList();
                foreach (var indentNode in indentNodes)
                {
                    var indent = (string)indentNode.Attribute("indent");
                    if (!string.IsNullOrEmpty(indent))
                    {
                        var indentVal = double.Parse(indent.Replace("E", "E-"), CultureInfo.InvariantCulture);          // непонятно, что делать с E
                        indentNode.SetAttributeValue("indent", indentVal.ToString("F", CultureInfo.InvariantCulture));
                    }
                }
            }
            catch (Exception ex)
            {
                _log.LogError(ex.ToString());
            }
        }

        public async Task UpdatePageContentAsync(string pageXml)
        {
            await UseOneNoteAppAsync(() => _app.UpdatePageContent(pageXml, DateTime.MinValue, OneNoteConstants.CurrentOneNoteSchema));
        }

        private static XmlNamespaceManager GetOneNoteXNM()
        {
            var xnm = new XmlNamespaceManager(new NameTable());
            xnm.AddNamespace("one", OneNoteConstants.OneNoteXmlNs);

            return xnm;
        }

        private async Task UseOneNoteAppAsync(Action action, int attemptsCount = 0)
        {
            try
            {
                if (_app == null)
                    _app = new Application();

                action?.Invoke();
            }
            catch (COMException ex)
            {
                if (ex.Message.Contains("0x80010100")                                        // "System.Runtime.InteropServices.COMException (0x80010100): System call failed. (Exception from HRESULT: 0x80010100 (RPC_E_SYS_CALL_FAILED))";
                 || ex.Message.Contains("0x800706BA")
                 || ex.Message.Contains("0x800706BE")
                 || ex.Message.Contains("0x80010001")                                        // System.Runtime.InteropServices.COMException (0x80010001): Вызов был отклонен. (Исключение из HRESULT: 0x80010001 (RPC_E_CALL_REJECTED))
                 || ex.Message.Contains("0x80010108"))                                       // RPC_E_DISCONNECTED                    
                {
                    _log.LogWarning($"UseOneNoteAPI. Attempt {attemptsCount}: {ex.Message}");
                    if (attemptsCount <= 15)
                    {
                        attemptsCount++;
                        await Task.Delay(1000 * attemptsCount);
                        ReleaseOneNoteApp();
                        await UseOneNoteAppAsync(action, attemptsCount);
                    }
                    else
                        throw;
                }
                else
                    throw;
            }
        }

        private void ReleaseOneNoteApp()
        {
            if (_app != null)
            {
                try
                {
                    Marshal.ReleaseComObject(_app);
                }
                catch (Exception releaseEx)
                {
                    _log.LogError(releaseEx.ToString());
                }

                _app = null;
            }
        }
    }
}
