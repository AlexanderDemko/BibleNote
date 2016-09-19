using BibleNote.Analytics.Contracts.Logging;
using HtmlAgilityPack;
using Microsoft.Office.Interop.OneNote;
using System;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
using System.Threading;
using System.Xml;

namespace BibleNote.Analytics.Providers.OneNote.Services
{
    public class OneNoteUtils
    {
        [DllImport("user32.dll")]
        private static extern bool SetForegroundWindow(IntPtr hWnd);

        private readonly ILog _log;

        public OneNoteUtils(ILog log)
        {
            _log = log;
        }

        public static XmlNamespaceManager GetOneNoteXNM()
        {
            var xnm = new XmlNamespaceManager(new NameTable());
            xnm.AddNamespace("one", Constants.OneNoteXmlNs);

            return xnm;
        }

        public static HtmlDocument GetXDocument(string xml)
        {
            var xDoc = new HtmlDocument();
            xDoc.LoadHtml(xml);            
            return xDoc;
        }

        public bool HierarchyElementExists(ref Application oneNoteApp, string hierarchyId)
        {
            try
            {
                string xml = null;

                UseOneNoteAPI(ref oneNoteApp, (oneNoteAppSafe) =>
                {
                    oneNoteAppSafe.GetHierarchy(hierarchyId, HierarchyScope.hsSelf, out xml, Constants.CurrentOneNoteSchema);
                });

                return true;
            }
            catch (COMException ex)
            {
                if (OneNoteUtils.IsError(ex, Error.hrObjectDoesNotExist))
                    return false;
                else
                    throw;
            }
        }

        public HtmlDocument GetHierarchyElement(ref Application oneNoteApp, string hierarchyId, HierarchyScope scope)
        {
            string xml = null;
            UseOneNoteAPI(ref oneNoteApp, (oneNoteAppSafe) =>
            {
                oneNoteAppSafe.GetHierarchy(hierarchyId, scope, out xml, Constants.CurrentOneNoteSchema);
            });
            return GetXDocument(xml);
        }

        public HtmlNode GetHierarchyElementByName(ref Application oneNoteApp, string elementTag, string elementName, string parentElementId)
        {            
            var parentEl = GetHierarchyElement(ref oneNoteApp, parentElementId, HierarchyScope.hsChildren);

            return parentEl.DocumentNode.SelectSingleNode(string.Format("one:{0}[@name=\"{1}\"]", elementTag, elementName));
        }


        public HtmlDocument GetPageContent(ref Application oneNoteApp, string pageId)
        {
            return GetPageContent(ref oneNoteApp, pageId, PageInfo.piBasic);
        }

        public HtmlDocument GetPageContent(ref Application oneNoteApp, string pageId, PageInfo pageInfo)
        {
            string xml = null;

            UseOneNoteAPI(ref oneNoteApp, (oneNoteAppSafe) =>
            {
                oneNoteAppSafe.GetPageContent(pageId, out xml, pageInfo, Constants.CurrentOneNoteSchema);
            });

            return GetXDocument(xml);
        }

        public static bool IsRecycleBin(HtmlNode hierarchyElement)
        {
            return bool.Parse(GetAttributeValue(hierarchyElement, "isInRecycleBin", false.ToString()))
                || bool.Parse(GetAttributeValue(hierarchyElement, "isRecycleBin", false.ToString()));
        }

        public static string NotInRecycleXPathCondition
        {
            get
            {
                return "not(@isInRecycleBin) and not(@isRecycleBin)";
            }
        }

        public static string GetAttributeValue(HtmlNode node, string attributeName, string defaultValue)
        {
            if (node.Attributes.Contains(attributeName))
                return node.Attributes[attributeName].Value;

            return defaultValue;
        }      

        public static HtmlNode NormalizeTextElement(HtmlTextNode textElement)  // must be one:T element
        {
            if (textElement != null)
            {
                if (!string.IsNullOrEmpty(textElement.InnerHtml))
                {
                    textElement.InnerHtml = Regex.Replace(textElement.InnerHtml, "([^>])(\\n|&nbsp;)([^<])", "$1 $3")
                                               // .Replace("<br>\n", "<br>\n\n")
                                               ;
                    //textElement.Value.Replace("\n", "").Replace("&nbsp;", "").Replace("<br>", "<br>\n");
                }
            }

            return textElement;
        }


        public void UpdatePageContentSafe(ref Application oneNoteApp, HtmlDocument pageContent, XmlNamespaceManager xnm, bool repeatIfPageIsReadOnly = true)
        {
            UpdatePageContentSafeInternal(ref oneNoteApp, pageContent, xnm, repeatIfPageIsReadOnly ? (int?)0 : null);
        }

        private void UpdatePageContentSafeInternal(ref Application oneNoteApp, HtmlDocument pageContent, XmlNamespaceManager xnm, int? attemptsCount)
        {
            var inkNodes = pageContent.DocumentNode.SelectNodes("one:InkDrawing")           // todo: проверить, что работает
                            .Union(pageContent.DocumentNode.SelectNodes("//one:OE[.//one:InkDrawing]"))
                            .Union(pageContent.DocumentNode.SelectNodes("one:Outline[.//one:InkWord]")).ToArray();

            foreach (var inkNode in inkNodes)
            {
                if (inkNode.SelectSingleNode(".//one:T") == null)
                    inkNode.Remove();
                else
                {
                    var inkWords = inkNode.SelectNodes(".//one:InkWord").Where(ink => ink.SelectSingleNode(".//one:CallbackID") == null);
                    foreach (var inkEl in inkWords)     // todo: проверить, что работает
                        inkEl.Remove();
                }
            }

            var pageTitleEl = pageContent.DocumentNode.SelectSingleNode("one:Title");                // могли случайно удалить заголовок со страницы
            if (pageTitleEl != null && pageTitleEl.ChildNodes.Count() == 0 && pageTitleEl.Attributes.Count() == 0)
                pageTitleEl.Remove();

            try
            {
                UseOneNoteAPI(ref oneNoteApp, (oneNoteAppSafe) =>
                {
                    oneNoteAppSafe.UpdatePageContent(pageContent.ToString(), DateTime.MinValue, Constants.CurrentOneNoteSchema);
                });
            }
            catch (COMException ex)
            {
                if (attemptsCount.GetValueOrDefault(int.MaxValue) < 30                                       // 15 секунд - но каждое обновление требует времени. поэтому на самом деле дольше
                    && (OneNoteUtils.IsError(ex, Error.hrPageReadOnly) || OneNoteUtils.IsError(ex, Error.hrSectionReadOnly)))
                {
                    Thread.Sleep(500);
                    UpdatePageContentSafeInternal(ref oneNoteApp, pageContent, xnm, attemptsCount + 1);
                }
                else
                    throw;
            }
        }

        public void UseOneNoteAPI(ref Application oneNoteApp, Action action)
        {
            UseOneNoteAPI(ref oneNoteApp, (safeOneNoteApp) => { action(); });
        }

        public void UseOneNoteAPI(ref Application oneNoteApp, Action<IApplication> action)
        {
            UseOneNoteAPIInternal(ref oneNoteApp, action, 0);
        }

        public Application CreateOneNoteAppSafe()
        {
            Application oneNoteApp = null;
            UseOneNoteAPIInternal(ref oneNoteApp, null, 0);
            return oneNoteApp;
        }

        public void ReleaseOneNoteApp(ref Application oneNoteApp)
        {
            if (oneNoteApp != null)
            {
                try
                {
                    Marshal.ReleaseComObject(oneNoteApp);
                }
                catch (Exception releaseEx)
                {
                    _log.Write(LogLevel.Error, releaseEx.ToString());
                }

                oneNoteApp = null;
            }
        }

        private void UseOneNoteAPIInternal(ref Application oneNoteApp, Action<IApplication> action, int attemptsCount)
        {
            try
            {
                if (oneNoteApp == null)
                    oneNoteApp = new Application();

                action?.Invoke(oneNoteApp);
            }
            catch (COMException ex)
            {
                if (ex.Message.Contains("0x80010100")                                           // "System.Runtime.InteropServices.COMException (0x80010100): System call failed. (Exception from HRESULT: 0x80010100 (RPC_E_SYS_CALL_FAILED))";
                    || ex.Message.Contains("0x800706BA")
                    || ex.Message.Contains("0x800706BE")
                    || ex.Message.Contains("0x80010001")                                        // System.Runtime.InteropServices.COMException (0x80010001): Вызов был отклонен. (Исключение из HRESULT: 0x80010001 (RPC_E_CALL_REJECTED))
                    || ex.Message.Contains("0x80010108")                                        // RPC_E_DISCONNECTED
                    )
                {
                    _log.Write(LogLevel.Warning, $"UseOneNoteAPI. Attempt {attemptsCount}: {ex.Message}");
                    if (attemptsCount <= 15)
                    {
                        attemptsCount++;
                        Thread.Sleep(1000 * attemptsCount);
                        //System.Windows.Forms.Application.DoEvents();

                        ReleaseOneNoteApp(ref oneNoteApp);
                        UseOneNoteAPIInternal(ref oneNoteApp, action, attemptsCount);
                    }
                    else
                        throw;
                }
                else
                    throw;
            }
        }

        //public static void UpdateElementMetaData(HtmlNode node, string key, string value, XmlNamespaceManager xnm)
        //{
        //    var metaElement = node.SelectSingleNode(string.Format("one:Meta[@name=\"{0}\"]", key));
        //    if (metaElement != null)
        //    {
        //        metaElement.SetAttributeValue("content", value);
        //    }
        //    else
        //    {
        //        var nms = XNamespace.Get(Constants.OneNoteXmlNs);

        //        var meta = new XElement(nms + "Meta",
        //                                    new XAttribute("name", key),
        //                                    new XAttribute("content", value));

        //        var beforeMetaEl = node.XPathSelectElement("one:MediaPlaylist", xnm) ?? node.XPathSelectElement("one:PageSettings", xnm);

        //        if (beforeMetaEl != null)
        //            beforeMetaEl.AddBeforeSelf(meta);
        //        else
        //        {
        //            var afterMetaEl = node.XPathSelectElement("one:Tag", xnm);
        //            if (afterMetaEl != null)
        //                afterMetaEl.AddAfterSelf(meta);
        //            else
        //                node.AddFirst(meta);
        //        }
        //    }
        //}

        public static string GetElementMetaData(HtmlNode node, string key, XmlNamespaceManager xnm)
        {
            var metaElement = node.SelectSingleNode(string.Format("one:Meta[@name=\"{0}\"]", key));
            if (metaElement != null)            
                return (string)metaElement.Attributes["content"].Value;           

            return null;
        }    

        public string GetElementPath(ref Application oneNoteApp, string elementId)
        {         
            var xDoc = GetHierarchyElement(ref oneNoteApp, elementId, HierarchyScope.hsSelf);
            return xDoc.DocumentNode.Attributes["path"].Value;
        }

        /// <summary>
        /// 
        /// </summary>
        /// <param name="oneNoteApp"></param>
        /// <param name="notebookId"></param>
        /// <returns>false - если хранится в skydrive</returns>
        public bool IsNotebookLocal(ref Application oneNoteApp, string notebookId)
        {
            try
            {
                string folderPath = GetElementPath(ref oneNoteApp, notebookId);

                Directory.GetCreationTime(folderPath);

                return true;
            }
            catch (NotSupportedException)
            {
                return false;
            }
        }

        public static string ParseNotebookName(string s)
        {
            if (!string.IsNullOrEmpty(s))            
                return s.Split(new string[] { Constants.NotebookNameDelimiter }, StringSplitOptions.None)[0];            

            return s;
        }        

        public static bool IsError(Exception ex, Error error)
        {
            return ex.Message.IndexOf(error.ToString(), StringComparison.InvariantCultureIgnoreCase) > -1
                || ex.Message.IndexOf(GetHexError(error), StringComparison.InvariantCultureIgnoreCase) > -1;
        }

        private static string GetHexError(Error error)
        {
            return string.Format("0x{0}", Convert.ToString((int)error, 16));
        }

        public static string ParseErrorAndMakeItMoreUserFriendly(string exceptionMessage)
        {
            var originalHexValue = Regex.Match(exceptionMessage, @"0x800[A-F\d]+").Value;
            if (!string.IsNullOrEmpty(originalHexValue))
            {
                var hexValue = originalHexValue.Replace("0x", "FFFFFFFF");
                long decValue;
                if (long.TryParse(hexValue, NumberStyles.HexNumber, CultureInfo.CurrentCulture.NumberFormat, out decValue))
                {
                    var errorCode = (Error)decValue;
                    var userFriendlyErrorMessage = GetUserFriendlyErrorMessage(errorCode);
                    exceptionMessage = exceptionMessage.Replace(originalHexValue, userFriendlyErrorMessage);
                }
            }

            return exceptionMessage;
        }

        private static string GetUserFriendlyErrorMessage(Error errorCode)
        {
            switch (errorCode)
            {
                //case Error.hrPageReadOnly:
                //    return Resources.Constants.Error_hrPageReadOnly;
                //case Error.hrInsertingInk:
                //    return Resources.Constants.Error_hrInsertingInk;
                default:
                    return errorCode.ToString();
            }
        }

        public void SetActiveCurrentWindow(ref Application oneNoteApp)
        {
            UseOneNoteAPI(ref oneNoteApp, (oneNoteAppSafe) =>
            {
                var window = oneNoteAppSafe.Windows.CurrentWindow;
                if (window != null)                                    
                    SetForegroundWindow(new IntPtr((long)window.WindowHandle));                                
            });
        }
    }

}
