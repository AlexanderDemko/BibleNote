using BibleNote.Infrastructure.SingleInstance;
using System;

namespace BibleNote.CommandsHandler
{
    class Program
    {
        static void Main(string[] args)
        {
            var publisher = new Publisher(Constants.ApplicationId);
            publisher.SendData(args);
            Console.WriteLine("Data was send");
        }
    }
}
