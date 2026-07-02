using MediatR;


namespace BibleNote.Middleware.NavigationProviders.Queries.OneNote.SelectHierarchy
{
    public class Request : IRequest
    {
        public string Title { get; set; }

        public string Description { get; set; }

        public string ButtonText { get; set; }

        public string CallbackFunction { get; set; }

        public Request(string title, string description, string buttonText, string callbackFunction)
        {
            Title = title;
            Description = description;
            ButtonText = buttonText;
            CallbackFunction = callbackFunction;
        }
    }
}
