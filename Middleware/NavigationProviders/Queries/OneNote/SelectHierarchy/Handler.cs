using BibleNote.Providers.OneNote.Contracts;
using ElectronNET.API;
using MediatR;
using Microsoft.Office.Interop.OneNote;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace BibleNote.Middleware.NavigationProviders.Queries.OneNote.SelectHierarchy
{
    public class Handler : IRequestHandler<Request>
    {
        private readonly IOneNoteAppWrapper oneNoteAppWrapper;

        public Handler(IOneNoteAppWrapper oneNoteAppWrapper)
        {
            this.oneNoteAppWrapper = oneNoteAppWrapper;
        }

        public async Task<Unit> Handle(Request request, CancellationToken cancellationToken)
        {
            await oneNoteAppWrapper.SelectHierarchyItems(
                request.Title,
                request.Description,
                request.ButtonText,
                new Callback(request.CallbackFunction));

            return Unit.Value;
        }

        class Callback : IQuickFilingDialogCallback
        {
            private readonly string callbackFunction;

            public Callback(string callbackFunction)
            {
                this.callbackFunction = callbackFunction;
            }

            public void OnDialogClosed(IQuickFilingDialog qfDialog)
            {
                if (!Electron.WindowManager.BrowserWindows.Any() || qfDialog.SelectedItem == null)
                    return;

                var hierarchyId = qfDialog.SelectedItem;
                var window = Electron.WindowManager.BrowserWindows.First();
                var url = $"javascript:{callbackFunction}('{hierarchyId}')";
                window.WebContents.LoadURLAsync(url).GetAwaiter();
            }
        }
    }
}