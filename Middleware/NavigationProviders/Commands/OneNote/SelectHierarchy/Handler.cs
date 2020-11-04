using AutoMapper;
using BibleNote.Providers.OneNote.Contracts;
using ElectronNET.API;
using MediatR;
using Microsoft.Office.Interop.OneNote;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace BibleNote.Middleware.NavigationProviders.Commands.OneNote.SelectHierarchy
{
    public class Handler : IRequestHandler<Request, List<HierarchyItemVm>>
    {
        private readonly IMapper mapper;
        private readonly IOneNoteAppWrapper oneNoteAppWrapper;

        public Handler(IMapper mapper, IOneNoteAppWrapper oneNoteAppWrapper)
        {
            this.mapper = mapper;
            this.oneNoteAppWrapper = oneNoteAppWrapper;
        }

        public async Task<List<HierarchyItemVm>> Handle(Request request, CancellationToken cancellationToken)
        {
            await this.oneNoteAppWrapper.SelectHierarchyItems("title", "descr", "checkboxText", new Callback());

            return new List<HierarchyItemVm>();
        }

        class Callback : IQuickFilingDialogCallback
        {
            public Callback() { }
            public void OnDialogClosed(IQuickFilingDialog qfDialog)
            {
                if (!Electron.WindowManager.BrowserWindows.Any())
                    return;

                var window = Electron.WindowManager.BrowserWindows.First();
                var url = $"javascript:window.onHierarchySelected('{qfDialog.SelectedItem}')";
                window.WebContents.LoadURLAsync(url);
                //Console.WriteLine(qfDialog.SelectedItem);
                //Console.WriteLine(qfDialog.PressedButton);
                //Console.WriteLine(qfDialog.CheckboxState);
            }
        }
    }
}