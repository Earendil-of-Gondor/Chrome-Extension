class ExtensionController {
    //Static
    static SHARED_FIRESTORE_REF = getFirestore(initializeApp(firebaseConfig))
    static SHARED_TUTORIALS_MODEL = new TutorialsModel()
    static SHARED_USER_EVENT_LISTNER_HANDLER = new UserEventListnerHandler()

    //Views
    #floatingSuggestionPopup

    //Controllers
    followTutorialViewController = null
    recordTutorialViewController = null

    constructor() {
        //this.#setUpIframeListner();
        this.#checkStatus();
    }



    #setUpIframeListner() {
        getFrameContents();
        function getFrameContents() {
            const iFrame = document.getElementsByTagName('iframe')[0];
            if (!isNotNull(iFrame)) {
                return;
            }
            if (!isNotNull(iFrame.contentDocument)) {
                setTimeout(() => {
                    getFrameContents();
                }, 1000);
                return;
            }
            let iFrameBody = iFrame.contentDocument.getElementsByTagName('body')[0];

            let iFrameBodyJQ = $(iFrameBody);
            // iFrameBodyJQ.on('click', async (event) => {
            //     onClickUniversalHandler(event);
            // })
        }
    }

    #checkStatus() {
        chrome.storage.sync.get(VALUES.TUTORIAL_STATUS.STATUS, (result) => {
            const savedStatus = result[VALUES.TUTORIAL_STATUS.STATUS];
            const cacheStatus = ExtensionController.SHARED_USER_EVENT_LISTNER_HANDLER.tutorialStatusCache;
            console.log('status cache: ' + cacheStatus + '| saved status: ' + savedStatus)
            if ((cacheStatus === savedStatus) && (savedStatus !== VALUES.TUTORIAL_STATUS.BEFORE_INIT_NULL)) return;
            if (cacheStatus === VALUES.TUTORIAL_STATUS.BEFORE_INIT_NULL) {
                ExtensionController.SHARED_USER_EVENT_LISTNER_HANDLER.setTutorialStatusCache(savedStatus);
                switch (savedStatus) {
                    case VALUES.TUTORIAL_STATUS.STOPPED_FROM_OTHER_PAGE:
                        this.#hideFollowingPanel()
                        break
                    case VALUES.TUTORIAL_STATUS.IS_RECORDING:
                        this.#showRecordingPanel()
                        break;
                    case VALUES.TUTORIAL_STATUS.IS_MANUALLY_FOLLOWING_TUTORIAL, VALUES.TUTORIAL_STATUS.IS_AUTO_FOLLOWING_TUTORIAL:
                        this.#showFollowingPanel(savedStatus)
                        break;
                    default:
                        this.#suggestTutorialIfExists(savedStatus)
                        break;
                }
            }
        })
    }

    async #suggestTutorialIfExists(status) {
        if (await ExtensionController.SHARED_TUTORIALS_MODEL.checkIfAnyTutorialExistsOnPage()) {
            this.#showSuggestionPopup(status)
        }
    }

    #showSuggestionPopup(status) {
        $('body').append(`
            <div id="w-suggestion-popup"></div>
        `)
        this.#floatingSuggestionPopup = $('#w-suggestion-popup')
        this.#floatingSuggestionPopup.on('click', () => {
            this.#showFollowingPanel(status)
            this.#floatingSuggestionPopup.remove()
        })
    }

    #showRecordingPanel() {
        this.#hideFollowingPanel()
        this.recordTutorialViewController = new RecordTutorialViewController()
    }

    #showFollowingPanel(status) {
        this.#hideRecordingPanel()
        this.followTutorialViewController = new FollowTutorialViewController(status, this)
    }

    #hideRecordingPanel() {
        this.recordTutorialViewController && this.recordTutorialViewController.dismiss()
        this.recordTutorialViewController = null
    }

    #hideFollowingPanel() {
        this.followTutorialViewController && this.followTutorialViewController.dismiss()
        this.followTutorialViewController = null
    }
}