using System;
using System.Globalization;
using System.Linq;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using System.Xml;
using System.Xml.Linq;
using System.Xml.XPath;
using BibleNote.Providers.OneNote.Constants;
using BibleNote.Providers.OneNote.Contracts;
using Microsoft.Extensions.Logging;
using Microsoft.Office.Interop.OneNote;
using BibleNote.Common.Extensions;
using BibleNote.Providers.OneNote.Exceptions;
using BibleNote.Providers.OneNote.Utils;

namespace BibleNote.Providers.OneNote.Services
{
    public class OneNoteAppWrapper : IOneNoteAppWrapper
    {
        private const int MaxOneNoteActionAttemptCount = 15;
        private const int OneNoteActionAttemptsDelay = 1000;
        
        private IApplication oneNoteApp;
        private readonly ILogger logger;
        private readonly SemaphoreSlim locker = new SemaphoreSlim(1, 1);

        public OneNoteAppWrapper(ILogger<OneNoteAppWrapper> logger)
        {
            this.logger = logger;
        }

        public async Task<string> GetPageContentAsync(string pageId, PageInfo pageInfo = PageInfo.piBasic)
        {
            string result = null;

            await UseOneNoteAppInSingleThreadAsync(app => 
            {
                app.GetPageContent(pageId, out result, pageInfo, OneNoteConstants.CurrentOneNoteSchema);
            }); 

            return result;
        }

        public async Task<string> GetCurrentPageIdAsync()
        {
            string currentPageId = null;

            await UseOneNoteAppInSingleThreadAsync(app =>
            {
                if (app.Windows.CurrentWindow == null)
                    throw new OneNoteIsClosedException();

                currentPageId = app.Windows.CurrentWindow.CurrentPageId;
            });

            return currentPageId;
        }

        public async Task<string> GetCurrentSectionIdAsync()
        {
            string currentSectionId = null;

            await UseOneNoteAppInSingleThreadAsync(app =>
            {
                if (app.Windows.CurrentWindow == null)
                    throw new OneNoteIsClosedException();

                currentSectionId = app.Windows.CurrentWindow.CurrentSectionId;
            });

            return currentSectionId;
        }

        public async Task UpdatePageContentAsync(XDocument pageDoc)
        {
            var xnm = OneNoteUtils.GetOneNoteXnm();

            CleanPageContent(pageDoc, xnm);

            await UseOneNoteAppInSingleThreadAsync(app =>
            {
                app.UpdatePageContent(pageDoc.ToString(), DateTime.MinValue, OneNoteConstants.CurrentOneNoteSchema);
            });
        }

        public async Task<string> GetHierarchyContentAsync(string hierarchyId, HierarchyScope scope)
        {
            string content = null;

            await UseOneNoteAppInSingleThreadAsync(app =>
            {
                app.GetHierarchy(hierarchyId, scope, out content, OneNoteConstants.CurrentOneNoteSchema);
            });

            return content;
        }

        public async Task<string> GetHierarchyNameAsync(string hierarchyId)
        {
            var hierarchyContent = await GetHierarchyContentAsync(hierarchyId, HierarchyScope.hsSelf);
            var hierarchyEl = XElement.Parse(hierarchyContent);
            return (string)hierarchyEl.Attribute("name");
        }

        public void Dispose()
        {
            ReleaseOneNoteApp();
        }

        public async Task SelectHierarchyItems(string title, string description, string checkboxText, IQuickFilingDialogCallback callback)
        {
            await UseOneNoteAppInSingleThreadAsync(app =>
            {
                // Instantiate Quick Filing UI
                var qfDialog = app.QuickFiling();
                #region//SET API PARAMETERS
                // TITLE
                qfDialog.Title = title;
                // DESCRIPTION
                qfDialog.Description = description;
                // RECENT RESULTS
                qfDialog.SetRecentResults(RecentResultType.rrtFiling,
                    /*Current Section*/ true,
                    /*Current Page*/ true,
                    /*Unfiled Notes*/ true);
                // TREE DEPTH
                qfDialog.TreeDepth = HierarchyElement.heSections;
                // CHECKBOX
                qfDialog.CheckboxText = checkboxText;
                qfDialog.CheckboxState = false;
                // BUTTONS
                HierarchyElement heAll = (HierarchyElement)
                    ((uint)HierarchyElement.heNotebooks |
                    (uint)HierarchyElement.heSectionGroups |
                    (uint)HierarchyElement.heSections);

                qfDialog.AddButton("All", heAll, heAll, true);
                qfDialog.AddButton("Notebooks", HierarchyElement.heNotebooks,
                    HierarchyElement.heNotebooks, false);
                qfDialog.AddButton("Sections", HierarchyElement.heSections,
                    HierarchyElement.heSections, false);
                // PARENTWINDOW
                #endregion
                // Display Quick Filing UI
                qfDialog.Run(callback);
                // Clean up and Wait so console window does not close
                qfDialog = null;
            });
        }

      

    private async Task UseOneNoteAppInSingleThreadAsync(Action<IApplication> action)
        {
            await this.locker.DoInSemaphore(async () =>
            {
                await UseOneNoteAppAsync(action);
            });
        }

        private async Task UseOneNoteAppAsync(Action<IApplication> action, int attemptsCount = 0)
        {
            try
            {
                if (oneNoteApp == null)
                    oneNoteApp = new Application();

                action?.Invoke(oneNoteApp);
            }
            catch (COMException ex)
            {
                if (ex.Message.Contains("0x80010100")                                        // "System.Runtime.InteropServices.COMException (0x80010100): System call failed. (Exception from HRESULT: 0x80010100 (RPC_E_SYS_CALL_FAILED))";
                 || ex.Message.Contains("0x800706BA")
                 || ex.Message.Contains("0x800706BE")
                 || ex.Message.Contains("0x80010001")                                        // System.Runtime.InteropServices.COMException (0x80010001): Вызов был отклонен. (Исключение из HRESULT: 0x80010001 (RPC_E_CALL_REJECTED))
                 || ex.Message.Contains("0x80010108"))                                       // RPC_E_DISCONNECTED                    
                {
                    logger.LogWarning($"UseOneNoteAPI. Attempt {attemptsCount}: {ex.Message}");
                    if (attemptsCount <= MaxOneNoteActionAttemptCount)
                    {
                        attemptsCount++;
                        await Task.Delay(OneNoteActionAttemptsDelay * attemptsCount);
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
            if (oneNoteApp != null)
            {
                try
                {
                    Marshal.ReleaseComObject(oneNoteApp);
                }
                catch (Exception releaseEx)
                {
                    logger.LogError(releaseEx.ToString());
                }

                oneNoteApp = null;
            }
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
                logger.LogError(ex.ToString());
            }
        }
    }
}
