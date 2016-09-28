﻿using BibleNote.Analytics.Contracts.Logging;
using BibleNote.Analytics.Providers.OneNote.Constants;
using BibleNote.Analytics.Services.Unity;
using System.Xml.XPath;
using Microsoft.Office.Interop.OneNote;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Xml.Linq;
using System.Xml;

namespace BibleNote.Analytics.Providers.OneNote.Services
{
    public class OneNoteAppWrapper : IDisposable
    {
        private IApplication _app;      // todo: не надо каждый раз создавать. Надо на уровне NavigationProvider-a один раз только создать.
        private ILog _log;

        public OneNoteAppWrapper()
        {
            _log = DIContainer.Resolve<ILog>();            
        }

        public string GetPageContent(string pageId, PageInfo pageInfo = PageInfo.piBasic)
        {
            string result = null;

            UseOneNoteApp(() => _app.GetPageContent(pageId, out result, pageInfo, OneNoteConstants.CurrentOneNoteSchema));

            return result;
        }

        public string GetCurrentPageId()
        {
            string currentPageId = null;            

            UseOneNoteApp(() =>
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
            ReleaseOneNoteApp();
        }

        public void UpdatePageContent(XDocument pageDoc)
        {
            var xnm = GetOneNoteXNM();

            var inkNodes = pageDoc.Root.XPathSelectElements("one:InkDrawing", xnm)
                               .Union(pageDoc.Root.XPathSelectElements("//one:OE[.//one:InkDrawing]", xnm))
                               .Union(pageDoc.Root.XPathSelectElements("one:Outline[.//one:InkWord]", xnm)).ToArray();

            foreach (var inkNode in inkNodes)
            {
                if (inkNode.XPathSelectElement(".//one:T", xnm) == null)
                    inkNode.Remove();
                else
                {
                    var inkWords = inkNode.XPathSelectElements(".//one:InkWord", xnm).Where(ink => ink.XPathSelectElement(".//one:CallbackID", xnm) == null).ToArray();
                    inkWords.Remove();
                }
            }

            var pageTitleEl = pageDoc.Root.XPathSelectElement("one:Title", xnm);                // могли случайно удалить заголовок со страницы
            if (pageTitleEl != null && !pageTitleEl.HasElements && !pageTitleEl.HasAttributes)
                pageTitleEl.Remove();
            
            UseOneNoteApp(() => _app.UpdatePageContent(pageDoc.ToString(), DateTime.MinValue, OneNoteConstants.CurrentOneNoteSchema));
        }

        public void UpdatePageContent(string pageXml)
        {
            UseOneNoteApp(() => _app.UpdatePageContent(pageXml, DateTime.MinValue, OneNoteConstants.CurrentOneNoteSchema));
        }

        private static XmlNamespaceManager GetOneNoteXNM()
        {
            var xnm = new XmlNamespaceManager(new NameTable());
            xnm.AddNamespace("one", OneNoteConstants.OneNoteXmlNs);

            return xnm;
        }

        private void UseOneNoteApp(Action action, int attemptsCount = 0)
        {
            try
            {
                if (_app == null)
                    _app = new Application();

                action?.Invoke();
            }
            catch (COMException ex)
            {
                if (ex.Message.Contains("0x80010100")                                           // "System.Runtime.InteropServices.COMException (0x80010100): System call failed. (Exception from HRESULT: 0x80010100 (RPC_E_SYS_CALL_FAILED))";
                 || ex.Message.Contains("0x800706BA")
                 || ex.Message.Contains("0x800706BE")
                 || ex.Message.Contains("0x80010001")                                        // System.Runtime.InteropServices.COMException (0x80010001): Вызов был отклонен. (Исключение из HRESULT: 0x80010001 (RPC_E_CALL_REJECTED))
                 || ex.Message.Contains("0x80010108"))                                        // RPC_E_DISCONNECTED                    
                {
                    _log.Write(LogLevel.Warning, $"UseOneNoteAPI. Attempt {attemptsCount}: {ex.Message}");
                    if (attemptsCount <= 15)
                    {
                        attemptsCount++;
                        Thread.Sleep(1000 * attemptsCount);
                        //System.Windows.Forms.Application.DoEvents();

                        ReleaseOneNoteApp();
                        UseOneNoteApp(action, attemptsCount);
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
                    _log.Write(LogLevel.Error, releaseEx.ToString());
                }

                _app = null;
            }
        }
    }
}
